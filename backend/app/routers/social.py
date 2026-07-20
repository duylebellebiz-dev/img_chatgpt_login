import secrets
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models.db_models import SocialAccount
from app.models.schemas import SocialAccountOut
from app.services import token_crypto
from app.services.auth_service import get_current_user_id
from app.services.meta_service import MetaAPIError, MetaService

router = APIRouter(prefix="/api/social", tags=["social"])

_OAUTH_STATE_COOKIE = "fb_oauth_state"


@router.get("/connect/facebook")
def connect_facebook(
    settings: Settings = Depends(get_settings),
    user_id: str = Depends(get_current_user_id),
) -> RedirectResponse:
    state = secrets.token_urlsafe(24)
    url = MetaService(settings).get_oauth_url(state)
    redirect = RedirectResponse(url)
    redirect.set_cookie(_OAUTH_STATE_COOKIE, state, max_age=600, httponly=True, samesite="lax")
    return redirect


@router.get("/connect/facebook/callback")
def connect_facebook_callback(
    code: str = Query(...),
    state: str = Query(...),
    fb_oauth_state: str | None = Cookie(default=None, alias=_OAUTH_STATE_COOKIE),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    user_id: str = Depends(get_current_user_id),
) -> RedirectResponse:
    """Facebook redirects the browser here after the user approves (or mock
    mode simulates that redirect — see MetaService.get_oauth_url). Redirects
    back to the frontend on success/failure instead of returning raw JSON,
    since this URL is loaded as a full-page browser navigation, not an API
    call from the SPA. The session cookie is still sent on this navigation
    (same-site), so get_current_user_id still resolves the connecting tenant."""
    if not fb_oauth_state or not secrets.compare_digest(fb_oauth_state, state):
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")

    meta = MetaService(settings)
    frontend_origin = settings.cors_origin_list[0] if settings.cors_origin_list else "/"

    try:
        user_token = meta.exchange_code_for_token(code)
        pages = meta.list_pages(user_token)
    except MetaAPIError as exc:
        # An "Invalid Scopes" style rejection is the EXPECTED outcome while
        # the read_insights/instagram_manage_insights App Review is pending
        # (see meta_service.py) — surface it as a page the admin can read
        # instead of an unhandled 500 that looks like a backend bug.
        redirect = RedirectResponse(f"{frontend_origin}/?tab=social&connect_error={quote(str(exc))}")
        redirect.delete_cookie(_OAUTH_STATE_COOKIE)
        return redirect

    if not pages:
        raise HTTPException(status_code=400, detail="No Facebook Pages found for this account.")

    # A previous connect attempt this tenant never finished picking a Page
    # for (closed the tab, tried again) would otherwise pile up here forever.
    db.query(SocialAccount).filter(
        SocialAccount.user_id == user_id, SocialAccount.status == "pending_selection"
    ).delete()

    for page in pages:
        fb_account = SocialAccount(
            user_id=user_id,
            platform="facebook_page",
            account_id=page.page_id,
            name=page.name,
            access_token_encrypted=token_crypto.encrypt_token(page.page_access_token, settings),
            status="pending_selection",
        )
        db.add(fb_account)

        if page.instagram_business_account_id:
            ig_account = SocialAccount(
                user_id=user_id,
                platform="instagram_business",
                account_id=page.instagram_business_account_id,
                name=f"{page.name} (Instagram)",
                access_token_encrypted=token_crypto.encrypt_token(page.page_access_token, settings),
                status="pending_selection",
            )
            db.add(ig_account)
            db.flush()
            fb_account.linked_account_id = ig_account.id

    db.commit()

    redirect = RedirectResponse(f"{frontend_origin}/?tab=social")
    redirect.delete_cookie(_OAUTH_STATE_COOKIE)
    return redirect


@router.get("/accounts", response_model=list[SocialAccountOut])
def list_accounts(
    status: str | None = None, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> list[SocialAccount]:
    query = db.query(SocialAccount).filter(SocialAccount.user_id == user_id)
    query = query.filter(SocialAccount.status == status) if status else query.filter(SocialAccount.status != "pending_selection")
    return query.order_by(SocialAccount.connected_at.desc()).all()


@router.post("/accounts/{account_id}/select", response_model=list[SocialAccountOut])
def select_account(
    account_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> list[SocialAccount]:
    """Activates the chosen Facebook Page (and its linked Instagram account,
    if any) from the pending_selection candidates a connect attempt produced,
    and discards every other candidate Page this tenant didn't pick."""
    account = db.get(SocialAccount, account_id)
    if (
        account is None
        or account.user_id != user_id
        or account.status != "pending_selection"
        or account.platform != "facebook_page"
    ):
        raise HTTPException(status_code=404, detail="No pending Facebook Page with this id")

    activated = [account]
    account.status = "active"
    if account.linked_account_id:
        linked = db.get(SocialAccount, account.linked_account_id)
        if linked is not None:
            linked.status = "active"
            activated.append(linked)

    # Exclude the ones just activated (in-session, not yet flushed) rather
    # than relying on flush ordering — autoflush is off on this session, so
    # a plain status == "pending_selection" filter here could still see
    # (and delete) the rows above before their new status is persisted.
    activated_ids = [a.id for a in activated]
    db.query(SocialAccount).filter(
        SocialAccount.user_id == user_id,
        SocialAccount.status == "pending_selection",
        SocialAccount.id.notin_(activated_ids),
    ).delete(synchronize_session=False)
    db.commit()
    for a in activated:
        db.refresh(a)
    return activated


@router.delete("/accounts/{account_id}")
def disconnect_account(
    account_id: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user_id)
) -> dict:
    account = db.get(SocialAccount, account_id)
    if account is None or account.user_id != user_id:
        raise HTTPException(status_code=404, detail="Social account not found")
    account.status = "revoked"
    db.commit()
    return {"ok": True}
