import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		cloudflareTest(async () => ({
			wrangler: { configPath: "./wrangler.jsonc" },
			// Tests never touch the real Cloudflare account
			remoteBindings: false,
			miniflare: {
				bindings: {
					TEST_MIGRATIONS: await readD1Migrations("./migrations"),
					ACUITY_USER_ID: "12345",
					ACUITY_API_KEY: "test-acuity-key",
					ADMIN_PASSWORD: "test-admin-password",
				},
			},
		})),
	],
	test: {
		setupFiles: ["./test/apply-migrations.js"],
	},
});
