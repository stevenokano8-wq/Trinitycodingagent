/**
 * USER_PROFILE — Durable Object
 *
 * Per-user settings, preferences, and workspace ownership.
 * Keyed by userId (idFromName(userId)).
 */

import { AppEnv } from "../../server/env.js";

interface UserSettings {
  theme: "dark" | "light";
  defaultModel: "reasoning" | "code_gen" | "fast";
  autoSave: boolean;
  tabSize: number;
  notifications: boolean;
}

interface UserProfileData {
  userId: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
  settings: UserSettings;
  workspaceIds: string[];
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: "dark",
  defaultModel: "reasoning",
  autoSave: true,
  tabSize: 2,
  notifications: true,
};

export class UserProfile {
  private state: DurableObjectState;
  private env: AppEnv;

  constructor(state: DurableObjectState, env: AppEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "GET" && pathname === "/profile") {
      const profile = await this.getOrCreate();
      return Response.json(profile);
    }

    if (request.method === "PUT" && pathname === "/profile") {
      const updates = await request.json() as Partial<UserProfileData>;
      const profile = await this.getOrCreate();
      const merged: UserProfileData = {
        ...profile,
        displayName: updates.displayName ?? profile.displayName,
        settings: { ...profile.settings, ...(updates.settings ?? {}) },
        updatedAt: new Date().toISOString(),
      };
      await this.state.storage.put("profile", merged);
      return Response.json(merged);
    }

    if (request.method === "GET" && pathname === "/workspaces") {
      const profile = await this.getOrCreate();
      return Response.json({ workspaceIds: profile.workspaceIds });
    }

    if (request.method === "POST" && pathname === "/workspaces") {
      const { workspaceId } = await request.json() as { workspaceId: string };
      const profile = await this.getOrCreate();
      if (!profile.workspaceIds.includes(workspaceId)) {
        profile.workspaceIds.push(workspaceId);
        profile.updatedAt = new Date().toISOString();
        await this.state.storage.put("profile", profile);
      }
      return Response.json({ ok: true, workspaceIds: profile.workspaceIds });
    }

    if (request.method === "DELETE" && pathname.startsWith("/workspaces/")) {
      const wsId  = pathname.split("/workspaces/")[1];
      const profile = await this.getOrCreate();
      profile.workspaceIds = profile.workspaceIds.filter(id => id !== wsId);
      profile.updatedAt = new Date().toISOString();
      await this.state.storage.put("profile", profile);
      return Response.json({ ok: true, workspaceIds: profile.workspaceIds });
    }

    if (request.method === "DELETE" && pathname === "/profile") {
      await this.state.storage.deleteAll();
      return Response.json({ ok: true });
    }

    return new Response("Not found", { status: 404 });
  }

  private async getOrCreate(): Promise<UserProfileData> {
    const existing = await this.state.storage.get<UserProfileData>("profile");
    if (existing) return existing;
    const profile: UserProfileData = {
      userId: this.state.id.toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { ...DEFAULT_SETTINGS },
      workspaceIds: [],
    };
    await this.state.storage.put("profile", profile);
    return profile;
  }
}
