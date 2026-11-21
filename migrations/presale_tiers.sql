-- Migration: Presale Tiers for Rumah Budaya Ratna
-- Jalankan file ini sekali untuk membuat tabel event_presale_tiers

CREATE TABLE IF NOT EXISTS event_presale_tiers (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  event_id   INT NOT NULL,
  tier_name  VARCHAR(100) NOT NULL,          -- e.g. "Presale 1", "Presale 2"
  tier_order INT NOT NULL DEFAULT 1,         -- urutan: 1, 2, 3, ...
  price      INT NOT NULL DEFAULT 0,
  quota      INT NOT NULL DEFAULT 50,
  sold       INT NOT NULL DEFAULT 0,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  INDEX idx_event_id   (event_id),
  INDEX idx_tier_order (event_id, tier_order)
);
