import type { ProfileInput } from "../../shared/contracts";

function words(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\b(back|front)[\s-]+end\b/g, "$1end")
      .replace(/\bfull[\s-]*stack\b/g, "fullstack")
      .replace(/\b(swe|sde)\b/g, "software engineer")
      .replace(/\bsre\b/g, "site reliability engineer")
      .replace(/\bqa\b/g, "quality assurance")
      .replace(/\bml\b/g, "machine learning")
      .replace(/\bai\b/g, "artificial intelligence")
      .replace(/\b(developers?|programmers?|engineers?)\b/g, "engineer")
      .match(/[\p{L}\p{N}+#]+/gu) ?? []
  );
}

export function roleMatcher(profile: ProfileInput | null) {
  if (!profile) return () => true;
  const roles = (
    profile.context.details?.roles.length
      ? profile.context.details.roles
      : profile.targetRoles.split(/[,;\n|]+/)
  ).filter((role) => role.trim().toLowerCase() !== "not listed");
  const targets = roles.map(words).filter((tokens) => tokens.length);
  // ponytail: title matching is deliberately conservative; extend aliases from
  // observed misses. All roles keeps unfamiliar titles available for review.
  return (job: { title: string }) => {
    const title = new Set(words(job.title));
    return (
      !targets.length ||
      targets.some((tokens) =>
        tokens.every(
          (token) =>
            title.has(token) ||
            (token === "software" &&
              tokens.includes("engineer") &&
              [
                "backend",
                "frontend",
                "fullstack",
                "web",
                "mobile",
                "android",
                "ios",
                "java",
                "javascript",
                "typescript",
                "python",
                "ruby",
                "golang",
                "php",
                "c++",
                "c#",
              ].some((specialty) => title.has(specialty))),
        ),
      )
    );
  };
}
