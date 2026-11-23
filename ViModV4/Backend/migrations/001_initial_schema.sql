CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (
  id SMALLSERIAL PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (name)
VALUES ('cliente'), ('arquitecto'), ('constructora')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(120) NOT NULL,
  correo VARCHAR(320) NOT NULL,
  password_hash TEXT NOT NULL,
  role_id SMALLINT NOT NULL REFERENCES roles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_correo_lower_unique
  ON users (LOWER(correo));

CREATE TABLE IF NOT EXISTS terrains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ubicacion VARCHAR(255) NOT NULL,
  ancho NUMERIC(12, 2) NOT NULL CHECK (ancho > 0),
  largo NUMERIC(12, 2) NOT NULL CHECK (largo > 0),
  area NUMERIC(18, 2) GENERATED ALWAYS AS (ROUND(ancho * largo, 2)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terrain_id UUID NOT NULL,
  nombre VARCHAR(160) NOT NULL,
  presupuesto NUMERIC(14, 2) CHECK (presupuesto IS NULL OR presupuesto > 0),
  estado VARCHAR(30) NOT NULL DEFAULT 'Borrador',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (terrain_id, user_id)
    REFERENCES terrains(id, user_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS terrains_user_id_idx ON terrains(user_id);
CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);
CREATE INDEX IF NOT EXISTS projects_terrain_id_idx ON projects(terrain_id);
