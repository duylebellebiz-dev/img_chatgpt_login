// In local dev this stays "" (same-origin) and Vite's dev proxy in
// vite.config.js forwards /api and /media to the local backend. In a
// production static build there's no such proxy, so VITE_API_URL (baked in
// at build time) must point straight at the deployed backend origin.
const BASE_URL = import.meta.env.VITE_API_URL || "";

// The backend returns image/logo URLs as origin-relative paths (e.g.
// "/media/generated/..."). In production those need the same BASE_URL prefix
// as API calls, or the browser resolves them against the frontend's own
// origin instead of the backend's.
export function mediaUrl(path) {
  return path ? `${BASE_URL}${path}` : path;
}

export async function createBatchJob({
  designImages,
  poseImages,
  pairingMode,
  numImages,
  description,
  imageWidth,
  imageHeight,
  campaignId,
}) {
  const form = new FormData();
  designImages.forEach((file) => form.append("design_images", file));
  poseImages.forEach((file) => form.append("pose_images", file));
  form.append("pairing_mode", pairingMode);
  form.append("num_images", String(numImages));
  form.append("description", description);
  if (imageWidth && imageHeight) {
    form.append("image_width", String(imageWidth));
    form.append("image_height", String(imageHeight));
  }
  if (campaignId) {
    form.append("campaign_id", campaignId);
  }

  const res = await fetch(`${BASE_URL}/api/batch`, { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Failed to create batch job");
  }
  return body;
}

export async function listBatchJobs(campaignId) {
  const query = campaignId ? `?campaign_id=${encodeURIComponent(campaignId)}` : "";
  const res = await fetch(`${BASE_URL}/api/batch${query}`, { credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Failed to list batch jobs");
  }
  return body;
}

export async function getBatchJob(jobId) {
  const res = await fetch(`${BASE_URL}/api/batch/${jobId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Failed to fetch job status");
  }
  return res.json();
}

export async function cancelBatchJob(jobId) {
  const res = await fetch(`${BASE_URL}/api/batch/${jobId}/cancel`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Failed to cancel batch job");
  }
  return body;
}

export function downloadUrl(jobId) {
  return `${BASE_URL}/api/batch/${jobId}/download`;
}

export async function deleteBatchJob(jobId) {
  const res = await fetch(`${BASE_URL}/api/batch/${jobId}`, { method: "DELETE", credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Failed to delete batch job");
  }
  return body;
}

export async function editImage({ image, prompt, imageWidth, imageHeight }) {
  const form = new FormData();
  form.append("image", image);
  form.append("prompt", prompt);
  if (imageWidth && imageHeight) {
    form.append("image_width", String(imageWidth));
    form.append("image_height", String(imageHeight));
  }

  const res = await fetch(`${BASE_URL}/api/edit`, { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Failed to edit image");
  }
  return body;
}

export async function createEditBatchJob({ images, prompt, imageWidth, imageHeight, applyLogo }) {
  const form = new FormData();
  images.forEach((file) => form.append("images", file));
  form.append("prompt", prompt);
  if (imageWidth && imageHeight) {
    form.append("image_width", String(imageWidth));
    form.append("image_height", String(imageHeight));
  }
  form.append("apply_logo", String(Boolean(applyLogo)));

  const res = await fetch(`${BASE_URL}/api/edit/batch`, { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Failed to create edit job");
  }
  return body;
}

export async function getEditBatchJob(jobId) {
  const res = await fetch(`${BASE_URL}/api/edit/batch/${jobId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Failed to fetch edit job status");
  }
  return res.json();
}

export async function cancelEditBatchJob(jobId) {
  const res = await fetch(`${BASE_URL}/api/edit/batch/${jobId}/cancel`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Failed to cancel edit job");
  }
  return body;
}

export function editDownloadUrl(jobId) {
  return `${BASE_URL}/api/edit/batch/${jobId}/download`;
}

export async function getImageEdit(editId) {
  const res = await fetch(`${BASE_URL}/api/edit/${editId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Failed to fetch photo edit");
  }
  return res.json();
}

export async function getLogo() {
  const res = await fetch(`${BASE_URL}/api/branding/logo`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Failed to fetch salon logo");
  }
  return res.json();
}

export async function uploadLogo(file) {
  const form = new FormData();
  form.append("logo", file);
  const res = await fetch(`${BASE_URL}/api/branding/logo`, { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Failed to upload salon logo");
  }
  return body;
}

export async function deleteLogo() {
  const res = await fetch(`${BASE_URL}/api/branding/logo`, { method: "DELETE" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Failed to remove salon logo");
  }
  return body;
}

// -- Auth (every salon registers its own account) ----------------------------
// These endpoints rely on an httpOnly session cookie, so every call needs
// credentials: "include" (both here and on the browser's cross-origin fetch
// in production, where BASE_URL points at a different origin than the app).

async function authedFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { ...options, credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.detail || "Request failed");
  }
  return body;
}

export async function register(email, password, salonName) {
  return authedFetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, salon_name: salonName }),
  });
}

export async function login(email, password) {
  return authedFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  return authedFetch("/api/auth/logout", { method: "POST" });
}

export async function getCurrentUser() {
  return authedFetch("/api/auth/me");
}

// -- Social accounts ---------------------------------------------------------

export function connectFacebookUrl() {
  return `${BASE_URL}/api/social/connect/facebook`;
}

export async function listSocialAccounts(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return authedFetch(`/api/social/accounts${query}`);
}

export async function selectSocialAccount(accountId) {
  return authedFetch(`/api/social/accounts/${accountId}/select`, { method: "POST" });
}

export async function disconnectSocialAccount(accountId) {
  return authedFetch(`/api/social/accounts/${accountId}`, { method: "DELETE" });
}

// -- Scheduled posts ----------------------------------------------------------

export async function createScheduledPost({ batchJobId, imageIds, editIds, socialAccountId, platform, suggestedDate }) {
  return authedFetch("/api/scheduled-posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      batch_job_id: batchJobId || null,
      image_ids: imageIds || [],
      edit_ids: editIds || [],
      social_account_id: socialAccountId,
      platform,
      suggested_date: suggestedDate,
    }),
  });
}

export async function listScheduledPosts(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return authedFetch(`/api/scheduled-posts${query}`);
}

export async function updateScheduledPost(postId, updates) {
  return authedFetch(`/api/scheduled-posts/${postId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export async function approveScheduledPost(postId) {
  return authedFetch(`/api/scheduled-posts/${postId}/approve`, { method: "POST" });
}

export async function rejectScheduledPost(postId) {
  return authedFetch(`/api/scheduled-posts/${postId}/reject`, { method: "POST" });
}

export async function deleteScheduledPost(postId) {
  return authedFetch(`/api/scheduled-posts/${postId}`, { method: "DELETE" });
}

// Schedules every ready image from a batch job (or every batch job in a
// campaign) in one call, spaced `intervalHours` apart starting at
// `startDate` — the bulk sibling of createScheduledPost above, for when a
// batch produced 20 images and they shouldn't need 20 individual clicks.
export async function bulkCreateScheduledPosts({
  batchJobId,
  campaignId,
  socialAccountId,
  platform,
  startDate,
  intervalHours,
  imagesPerPost,
}) {
  return authedFetch("/api/scheduled-posts/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      batch_job_id: batchJobId || null,
      campaign_id: campaignId || null,
      social_account_id: socialAccountId,
      platform,
      start_date: startDate,
      interval_hours: intervalHours ?? 24,
      images_per_post: imagesPerPost ?? 1,
    }),
  });
}

export async function bulkApproveScheduledPosts({ postIds, campaignId }) {
  return authedFetch("/api/scheduled-posts/bulk-approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_ids: postIds || [], campaign_id: campaignId || null }),
  });
}

export async function bulkRejectScheduledPosts({ postIds, campaignId }) {
  return authedFetch("/api/scheduled-posts/bulk-reject", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_ids: postIds || [], campaign_id: campaignId || null }),
  });
}

// -- Campaigns -----------------------------------------------------------------

export async function createCampaign({
  name,
  description,
  startDate,
  endDate,
  autoRefillEnabled,
  autoRefillSocialAccountId,
  autoRefillPlatform,
  autoRefillIntervalHours,
}) {
  return authedFetch("/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      description,
      start_date: startDate || null,
      end_date: endDate || null,
      auto_refill_enabled: Boolean(autoRefillEnabled),
      auto_refill_social_account_id: autoRefillSocialAccountId || null,
      auto_refill_platform: autoRefillPlatform || null,
      auto_refill_interval_hours: autoRefillIntervalHours ?? 24,
    }),
  });
}

export async function listCampaigns(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return authedFetch(`/api/campaigns${query}`);
}

export async function getCampaign(campaignId) {
  return authedFetch(`/api/campaigns/${campaignId}`);
}

export async function updateCampaign(campaignId, updates) {
  return authedFetch(`/api/campaigns/${campaignId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export async function deleteCampaign(campaignId) {
  return authedFetch(`/api/campaigns/${campaignId}`, { method: "DELETE" });
}

// -- Usage / performance dashboard -----------------------------------------------

export async function getUsageSummary(year, month) {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (month) params.set("month", String(month));
  const query = params.toString() ? `?${params.toString()}` : "";
  return authedFetch(`/api/usage/summary${query}`);
}

export async function getPerformanceSummary(campaignId) {
  const query = campaignId ? `?campaign_id=${encodeURIComponent(campaignId)}` : "";
  return authedFetch(`/api/performance/summary${query}`);
}

export async function triggerPerformanceSync() {
  return authedFetch("/api/performance/sync", { method: "POST" });
}

// -- Notifications -------------------------------------------------------------

export async function listNotifications(unreadOnly = false) {
  const query = unreadOnly ? "?unread_only=true" : "";
  return authedFetch(`/api/notifications${query}`);
}

export async function markNotificationRead(notificationId) {
  return authedFetch(`/api/notifications/${notificationId}/read`, { method: "POST" });
}

export async function deleteNotification(notificationId) {
  return authedFetch(`/api/notifications/${notificationId}`, { method: "DELETE" });
}
