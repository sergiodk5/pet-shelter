CREATE TABLE "pets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"species" text NOT NULL,
	"breed" text NOT NULL,
	"age" integer NOT NULL,
	"intake_date" timestamp with time zone NOT NULL,
	"adoption_date" timestamp with time zone,
	"photo" text NOT NULL,
	"weight_kg" double precision NOT NULL,
	"microchip_id" text,
	"vaccinations" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "pets_microchip_id_unique" UNIQUE("microchip_id"),
	CONSTRAINT "pets_age_non_negative" CHECK ("pets"."age" >= 0),
	CONSTRAINT "pets_weight_positive" CHECK ("pets"."weight_kg" > 0)
);
