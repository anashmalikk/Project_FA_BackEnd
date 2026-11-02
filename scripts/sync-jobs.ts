
import "dotenv/config";
import {
  PrismaClient,
  JobType,
  JobStatus,
  Region,
} from "@prisma/client";

const prisma = new PrismaClient();

const API_URL = process.env.JOB_API_URL;
const API_KEY = process.env.JOB_API_KEY;
const SOURCE = process.env.JOB_API_SOURCE || "JOB_API";

type ExternalJob = {
  id?: string | number;
  title?: string;
  company?: string;
  about_company?: string;
  job_description?: string;
  job_title?: string;
  job_type?: string;
  location?: string;
  experience?: string;
  role_and_responsibility?: string;
  education_and_skills?: string;
  apply_link?: string;
  posted_date?: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function mapJobType(value: string): JobType {
  const normalized = value.toLowerCase();

  if (normalized.includes("intern")) {
    return JobType.internship;
  }

  // Your enum also supports "competition".
  // Ordinary employment listings map to "jobs".
  return JobType.jobs;
}

function mapRegion(location: string): Region {
  const normalized = location.toLowerCase();

  if (
    normalized.includes("hybrid")
  ) {
    return Region.hybrid;
  }

  if (
    normalized.includes("remote") ||
    normalized.includes("work from home") ||
    normalized === "online"
  ) {
    return Region.online;
  }

  return Region.offline;
}

function parsePostedDate(value: string): Date | null {
  if (!value) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

async function fetchJobs(): Promise<ExternalJob[]> {
  if (!API_URL) {
    throw new Error("JOB_API_URL is missing from environment variables");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (API_KEY) {
    const keyName = "x-api-key";
    if (API_KEY) {
      headers[keyName] = API_KEY;
    }
  }

  const response = await fetch(API_URL, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `Job API failed: ${response.status} ${response.statusText}`,
    );
  }
const payload: unknown = await response.json();

  // Supports common API response wrappers.
  if (Array.isArray(payload)) {
    return payload as ExternalJob[];
  }

  if (payload && typeof payload === "object") {
    const data = payload as Record<string, unknown>;

    for (const key of ["results", "jobs", "data"]) {
      if (Array.isArray(data[key])) {
        return data[key] as ExternalJob[];
      }
    }

    // Also support { data: { jobs: [...] } }.
    if (data.data && typeof data.data === "object") {
      const nested = data.data as Record<string, unknown>;

      if (Array.isArray(nested.jobs)) {
        return nested.jobs as ExternalJob[];
      }
    }
  }

  throw new Error("Unrecognized job API response format");
}

async function syncJobs() {
  const jobs = await fetchJobs();

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  console.log(`Fetched ${jobs.length} jobs from ${SOURCE}`);

  for (const job of jobs) {
    try {
      const companyName = text(job.company);
      const title = text(job.job_title) || text(job.title);
      const applyUrl = text(job.apply_link);
      const externalId =
        job.id === undefined || job.id === null
          ? ""
          : String(job.id);

      if (!companyName || !title) {
        console.warn("Skipping job without company or title");
        skipped++;
        continue;
      }

      let organization = await prisma.organization.findFirst({
        where: { name: companyName },
      });

      if (!organization) {
        organization = await prisma.organization.create({
          data: {
            name: companyName,
            apiId: "indian api"+companyName,
          },
        });
      }

      const data = {
        title,
        aboutCompany: text(job.about_company) || null,
        description:
          text(job.job_description) ||
          text(job.title) ||
          title,
        organizationId: organization.id,
        visibility: "PUBLIC",
        type: mapJobType(text(job.job_type)),
        status: JobStatus.LIVE,
        region: mapRegion(text(job.location)),
        experience: text(job.experience) || null,
        educationAndSkills:
          text(job.education_and_skills) || null,
        roleAndResponsibility:
          text(job.role_and_responsibility) || null,
        applyUrl: applyUrl || null,
        publicUrl: applyUrl || null,
        postedDate: parsePostedDate(text(job.posted_date)),
      };

      // Match only records imported from this provider.
      // Never overwrite manually created jobs.
      const existing = await prisma.job.findFirst({
        where: {
          source: SOURCE,
          OR: [
            ...(externalId ? [{ apiId: externalId }] : []),
            ...(applyUrl ? [{ applyUrl }] : []),
          ],
        },
      });

      if (existing) {
        await prisma.job.update({
          where: { id: existing.id },
          data: {
            ...data,
            apiId: externalId || existing.apiId,
          },
        });

        updated++;
      } else {
        await prisma.job.create({
          data: {
            ...data,
            apiId: externalId || "not-found",
            source: SOURCE,
          },
        });

        created++;
      }
    } catch (error) {
      failed++;
      console.error(
        `Failed to sync job "${text(job.job_title) || text(job.title)}":`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("Job synchronization completed", {
    fetched: jobs.length,
    created,
    updated,
    skipped,
    failed,
  });

  if (failed > 0) {
    throw new Error(`${failed} job(s) failed to synchronize`);
  }
}

async function main() {
  try {
    await syncJobs();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Job synchronization failed:", error);
  process.exitCode = 1;
});
