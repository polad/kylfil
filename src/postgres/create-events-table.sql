CREATE TABLE public.events (
  seq SERIAL,
  id uuid NOT NULL,
  stream_id bytea NOT NULL,
  version integer NOT NULL,
  type character varying(255) NOT NULL,
  data jsonb,
  PRIMARY KEY ( seq ),
  UNIQUE ( id ),
  UNIQUE ( stream_id, version )
);
