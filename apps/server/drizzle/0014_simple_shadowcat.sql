CREATE TABLE "authentication_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" text NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"auth_flow_id" uuid NOT NULL,
	"identity" jsonb NOT NULL,
	"encrypted_state" text,
	"key_version" integer,
	"status" text NOT NULL,
	"created_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "browser_authentication_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"setup_test_id" uuid NOT NULL,
	"refresh_mode" text NOT NULL,
	"max_age_seconds" integer NOT NULL,
	"refresh_before_expiry_seconds" integer NOT NULL,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "profile_environment_authentications" (
	"profile_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"auth_flow_id" uuid NOT NULL,
	"secret_bindings" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_environment_authentications_profile_id_environment_id_pk" PRIMARY KEY("profile_id","environment_id")
);
--> statement-breakpoint
CREATE TABLE "profile_environments" (
	"profile_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	CONSTRAINT "profile_environments_profile_id_environment_id_pk" PRIMARY KEY("profile_id","environment_id")
);
--> statement-breakpoint
INSERT INTO "profile_environments" ("profile_id", "environment_id")
SELECT DISTINCT "profile_id", "environment_id" FROM "profile_variables";
--> statement-breakpoint
CREATE TABLE "project_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"encrypted_value" text,
	"key_version" integer,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "secret_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"secret_id" uuid,
	"actor_id" uuid,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authentication_states" ADD CONSTRAINT "authentication_states_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_states" ADD CONSTRAINT "authentication_states_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_states" ADD CONSTRAINT "authentication_states_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_states" ADD CONSTRAINT "authentication_states_auth_flow_id_browser_authentication_flows_id_fk" FOREIGN KEY ("auth_flow_id") REFERENCES "public"."browser_authentication_flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_authentication_flows" ADD CONSTRAINT "browser_authentication_flows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_authentication_flows" ADD CONSTRAINT "browser_authentication_flows_setup_test_id_tests_id_fk" FOREIGN KEY ("setup_test_id") REFERENCES "public"."tests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_authentication_flows" ADD CONSTRAINT "browser_authentication_flows_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_environment_authentications" ADD CONSTRAINT "profile_environment_authentications_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_environment_authentications" ADD CONSTRAINT "profile_environment_authentications_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_environment_authentications" ADD CONSTRAINT "profile_environment_authentications_auth_flow_id_browser_authentication_flows_id_fk" FOREIGN KEY ("auth_flow_id") REFERENCES "public"."browser_authentication_flows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_environments" ADD CONSTRAINT "profile_environments_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_environments" ADD CONSTRAINT "profile_environments_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_secrets" ADD CONSTRAINT "project_secrets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_audit_events" ADD CONSTRAINT "secret_audit_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_audit_events" ADD CONSTRAINT "secret_audit_events_secret_id_project_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."project_secrets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_audit_events" ADD CONSTRAINT "secret_audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "authentication_states_scope_unique" ON "authentication_states" USING btree ("owner","project_id","environment_id","profile_id");--> statement-breakpoint
CREATE INDEX "authentication_states_expiry_idx" ON "authentication_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "browser_auth_flows_project_idx" ON "browser_authentication_flows" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "browser_auth_flows_setup_test_idx" ON "browser_authentication_flows" USING btree ("setup_test_id");--> statement-breakpoint
CREATE INDEX "profile_environment_auth_flow_idx" ON "profile_environment_authentications" USING btree ("auth_flow_id");--> statement-breakpoint
CREATE INDEX "profile_environments_environment_idx" ON "profile_environments" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "project_secrets_project_idx" ON "project_secrets" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_secrets_active_name_unique" ON "project_secrets" USING btree ("project_id","name") WHERE "project_secrets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "secret_audit_project_created_idx" ON "secret_audit_events" USING btree ("project_id","created_at");
