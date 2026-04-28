import { describe, expect, it } from "vitest";
import { ADMIN_HELP_TOPICS, getAllowedHelpTopics, getHelpTopicById } from "./AdminHelp";

function canReadTopic(role: "manager" | "admin", topicId: string): boolean {
  const topic = getHelpTopicById(topicId);
  if (!topic) return false;
  return getAllowedHelpTopics(role).some((allowedTopic) => allowedTopic.id === topic.id);
}

describe("admin help topics", () => {
  it("shows only operable help pages to managers", () => {
    const topics = getAllowedHelpTopics("manager");

    expect(topics.map((topic) => topic.id)).toEqual(["dashboard", "shifts", "corrections"]);
    expect(topics.every((topic) => topic.roles.includes("manager"))).toBe(true);
  });

  it("keeps admin-only help pages out of manager list and direct URL access", () => {
    const adminOnlyIds = ADMIN_HELP_TOPICS.filter((topic) => !topic.roles.includes("manager")).map(
      (topic) => topic.id,
    );

    expect(adminOnlyIds).toEqual(["employees", "stores", "exports", "audit"]);
    const managerTopicIds = getAllowedHelpTopics("manager").map((topic) => topic.id);
    expect(managerTopicIds.filter((topicId) => adminOnlyIds.includes(topicId))).toEqual([]);
    expect(adminOnlyIds.every((topicId) => !canReadTopic("manager", topicId))).toBe(true);
  });

  it("shows every help page to admins", () => {
    const topics = getAllowedHelpTopics("admin");

    expect(topics).toHaveLength(ADMIN_HELP_TOPICS.length);
    expect(topics.map((topic) => topic.id)).toContain("exports");
    expect(topics.map((topic) => topic.id)).toContain("audit");
  });

  it("allows admins to read admin-only export and audit help pages", () => {
    expect(canReadTopic("admin", "exports")).toBe(true);
    expect(canReadTopic("admin", "audit")).toBe(true);
    expect(getHelpTopicById("exports")?.roles).toEqual(["admin"]);
    expect(getHelpTopicById("audit")?.roles).toEqual(["admin"]);
  });

  it("finds a topic by its URL id", () => {
    expect(getHelpTopicById("shifts")?.route).toBe("/admin/shifts");
    expect(getHelpTopicById("missing")).toBeUndefined();
  });
});
