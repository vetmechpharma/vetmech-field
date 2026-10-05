declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    WHATSAPP_WEBHOOK_URL?: string;
    WHATSAPP_API_KEY?: string;
    WHATSAPP_SESSION?: string;
    BUCKET?: R2Bucket;
  }
}
