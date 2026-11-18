import { beforeAll, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { executeStatement } from "../../infrastructure/database/client";
import { runMigrations } from "../../infrastructure/database/migrate";
import { handleError } from "../../shared/http/error-handler";
import { trackerRoutes } from "./routes";

const app = new Hono().route("/api/tracker", trackerRoutes);
app.onError(handleError);

beforeAll(async () => {
  await runMigrations();
});

describe("minimal tracker API", () => {
  test("validates, persists, relates, and cascades tracker records", async () => {
    const badCompany = await app.request("/api/tracker/companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "  " }),
    });
    expect(badCompany.status).toBe(400);

    const companyResponse = await app.request("/api/tracker/companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Northstar", status: "Listed" }),
    });
    expect(companyResponse.status).toBe(201);
    const company = (await companyResponse.json()) as {
      id: string;
      applicationCount: number;
    };

    const invalidUrl = await app.request("/api/tracker/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Engineer",
        companyId: company.id,
        sourceUrl: "javascript:alert(1)",
      }),
    });
    expect(invalidUrl.status).toBe(400);

    const appResponse = await app.request("/api/tracker/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Engineer",
        companyId: company.id,
        status: "To apply",
        sourceUrl: "https://jobs.example/1",
      }),
    });
    expect(appResponse.status).toBe(201);
    const application = (await appResponse.json()) as {
      id: string;
      companyName: string;
    };
    expect(application.companyName).toBe("Northstar");

    const otherCompanyResponse = await app.request("/api/tracker/companies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Other company" }),
    });
    const otherCompany = (await otherCompanyResponse.json()) as { id: string };
    const reassignment = await app.request(
      `/api/tracker/applications/${application.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId: otherCompany.id }),
      },
    );
    expect(reassignment.status).toBe(409);
    await expect(
      executeStatement(
        "UPDATE tracker_applications SET company_id=? WHERE id=?",
        [otherCompany.id, application.id],
      ),
    ).rejects.toThrow("application company cannot be changed");

    const companyList = await app.request("/api/tracker/companies");
    const listedCompanies = (await companyList.json()) as {
      name: string;
      applicationCount: number;
    }[];
    expect(
      listedCompanies.find((row) => row.name === "Northstar")?.applicationCount,
    ).toBe(1);

    const deleteResponse = await app.request(
      `/api/tracker/companies/${company.id}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(200);
    const applicationList = await app.request("/api/tracker/applications");
    expect(await applicationList.json()).toEqual([]);
  });
});
