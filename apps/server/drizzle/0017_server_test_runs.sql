CREATE TABLE "run_schedule_tests" (
	"schedule_id" uuid NOT NULL,
	"test_id" uuid NOT NULL,
	CONSTRAINT "run_schedule_tests_schedule_id_test_id_pk" PRIMARY KEY("schedule_id","test_id")
);
--> statement-breakpoint
CREATE TABLE "run_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"cron" text NOT NULL,
	"environment_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_enqueued_at" timestamp with time zone,
	"revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "server_run_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"schedule_id" uuid,
	"test_id" uuid NOT NULL,
	"test_revision_id" uuid NOT NULL,
	"test_revision_number" integer NOT NULL,
	"environment_id" uuid NOT NULL,
	"profile_id" uuid,
	"source" text NOT NULL,
	"status" text NOT NULL,
	"run_id" uuid,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "screenshot_path" text;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "video_path" text;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "run_schedule_tests" ADD CONSTRAINT "run_schedule_tests_schedule_id_run_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."run_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_schedule_tests" ADD CONSTRAINT "run_schedule_tests_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_schedules" ADD CONSTRAINT "run_schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_schedules" ADD CONSTRAINT "run_schedules_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_schedules" ADD CONSTRAINT "run_schedules_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_run_jobs" ADD CONSTRAINT "server_run_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_run_jobs" ADD CONSTRAINT "server_run_jobs_schedule_id_run_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."run_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_run_jobs" ADD CONSTRAINT "server_run_jobs_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_run_jobs" ADD CONSTRAINT "server_run_jobs_test_revision_id_test_revisions_id_fk" FOREIGN KEY ("test_revision_id") REFERENCES "public"."test_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_run_jobs" ADD CONSTRAINT "server_run_jobs_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_run_jobs" ADD CONSTRAINT "server_run_jobs_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_run_jobs" ADD CONSTRAINT "server_run_jobs_run_id_test_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_schedule_tests_test_idx" ON "run_schedule_tests" USING btree ("test_id");--> statement-breakpoint
CREATE INDEX "run_schedules_project_idx" ON "run_schedules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "run_schedules_due_idx" ON "run_schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "server_run_jobs_status_queued_idx" ON "server_run_jobs" USING btree ("status","queued_at");--> statement-breakpoint
CREATE INDEX "server_run_jobs_project_queued_idx" ON "server_run_jobs" USING btree ("project_id","queued_at");