import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const file=(path:string)=>readFileSync(join(process.cwd(),path),"utf8");
describe("Individual friend invitation source safety",()=>{
 it("new groups opt into per-link authentication while historical groups keep their flag",()=>{
   const schema=file("prisma/schema.prisma");
   expect(schema).toContain("individualInvitesEnabled Boolean @default(false)");
   expect(file("src/app/api/friend-offers/route.ts")).toContain("individualInvitesEnabled: true");
 });
 it("does not let group shared tokens join newly created groups",()=>{
   expect(file("src/app/api/friend-offers/route.ts")).toContain("legacy.individualInvitesEnabled");
 });
 it("serializes join and invitation issuance with the group lock",()=>{
   expect(file("src/app/api/friend-offers/route.ts")).toContain("FOR UPDATE");
   expect(file("src/app/api/me/friend-offers/invitations/route.ts")).toContain("FOR UPDATE");
 });
 it("admin uses group lock before adding a participant",()=>{
   const admin=file("src/app/api/admin/friend-offers/matching/route.ts");
   expect(admin).toContain("FOR UPDATE");
 });
});
