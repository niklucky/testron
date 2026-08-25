CREATE TABLE "password_reset_email_outbox" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "password_reset_email_outbox" ADD CONSTRAINT "password_reset_email_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "password_reset_email_outbox_available_idx" ON "password_reset_email_outbox" USING btree ("available_at");