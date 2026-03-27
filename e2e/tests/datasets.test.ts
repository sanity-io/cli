import { describe, expect, test } from "vitest";

import { sanity } from "../helpers.js";

const PROJECT_ID = process.env.SANITY_E2E_PROJECT_ID!;
const TOKEN = process.env.SANITY_E2E_TOKEN!;
const VERBOSE = Boolean(process.env.E2E_VERBOSE);

describe("dataset list", () => {
  test("lists datasets unattended via --project-id flag", async () => {
    const { exitCode, output } = await sanity(
      ["dataset", "list", "--project-id", PROJECT_ID],
      {
        env: { SANITY_TOKEN: TOKEN },
        verbose: VERBOSE,
      },
    );

    expect(exitCode).toBe(0);
    expect(output).toMatch(/production/);
  });

  test("lists datasets after selecting project from prompt", async () => {
    const { exitCode, output } = await sanity(["dataset", "list"], {
      env: { SANITY_TOKEN: TOKEN },
      inputs: [
        { repeat: true, send: "\x1b[B", waitFor: "Select project" },
        { send: "\r", waitFor: PROJECT_ID },
      ],
      verbose: VERBOSE,
    });

    expect(exitCode).toBe(0);
    expect(output).toMatch(/production/);
  });
});
