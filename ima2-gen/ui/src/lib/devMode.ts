// Centralized runtime gates. Node mode is now a product feature in packaged
// builds; set VITE_IMA2_NODE_MODE=0 only when a release must hide it.
export const IS_DEV_UI =
  import.meta.env.DEV || import.meta.env.VITE_IMA2_DEV === "1";

export const ENABLE_NODE_MODE = import.meta.env.VITE_IMA2_NODE_MODE !== "0";

// Card News remains a dev workspace. It can be hidden inside dev with
// VITE_IMA2_CARD_NEWS=0, but it must not appear in packaged/product UI.
export const ENABLE_CARD_NEWS_MODE =
  IS_DEV_UI && import.meta.env.VITE_IMA2_CARD_NEWS !== "0";

// Agent mode is a product feature in packaged builds; set
// VITE_IMA2_AGENT_MODE=0 only when a release must hide it.
export const ENABLE_AGENT_MODE = import.meta.env.VITE_IMA2_AGENT_MODE !== "0";
