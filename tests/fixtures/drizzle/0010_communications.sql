CREATE TABLE communication_settings (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated TEXT NOT NULL);
CREATE TABLE email_outbox (id TEXT PRIMARY KEY NOT NULL, mr_email TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL, error TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, sent_at TEXT);
CREATE INDEX email_outbox_created ON email_outbox(created);
