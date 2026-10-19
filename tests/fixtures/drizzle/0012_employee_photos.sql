ALTER TABLE members ADD COLUMN photo_version TEXT NOT NULL DEFAULT '';
CREATE TABLE employee_photos (
 email TEXT PRIMARY KEY NOT NULL,
 image_base64 TEXT NOT NULL,
 updated TEXT NOT NULL
);
