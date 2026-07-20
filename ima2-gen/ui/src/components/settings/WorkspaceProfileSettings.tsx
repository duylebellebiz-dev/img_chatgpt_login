import { useAppStore } from "../../store/useAppStore";
import { useI18n } from "../../i18n";
import type { WorkspaceProfile } from "../../lib/workspaceProfile";
import { Select } from "../controls/Select";

const PROFILES: { value: WorkspaceProfile; labelKey: string; descKey: string }[] = [
  { value: "default", labelKey: "workspace.defaultLabel", descKey: "workspace.defaultDesc" },
  { value: "prompt-studio", labelKey: "workspace.promptStudioLabel", descKey: "workspace.promptStudioDesc" },
];

export function WorkspaceProfileSettings() {
  const profile = useAppStore((s) => s.workspaceProfile);
  const setProfile = useAppStore((s) => s.setWorkspaceProfile);
  const { t } = useI18n();

  return (
    <div className="settings-field">
      <Select
        id="workspace-profile-select"
        value={profile}
        onChange={(v) => setProfile(v as WorkspaceProfile)}
        ariaLabel={t("workspace.profileLabel")}
        items={PROFILES.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
      />
    </div>
  );
}
