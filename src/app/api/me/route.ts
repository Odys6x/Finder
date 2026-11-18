import { cookies } from "next/headers";
import { config } from "@/lib/config";
import { getChatCount, getPass, unsign, devUnlockAllowed } from "@/lib/session";
import { publicPricing } from "@/lib/pricing";
import { resolveProviderKind } from "@/lib/chat/provider";
import { commuteEnabled } from "@/lib/commute";

export const dynamic = "force-dynamic";

export async function GET() {
  const pass = await getPass();
  const anon = unsign((await cookies()).get("sp_anon")?.value);
  const used = anon ? await getChatCount(anon) : 0;
  return Response.json(
    {
      pass: pass ? { tier: pass.tier, code: pass.code, validUntil: pass.valid_until } : null,
      chatRemaining: pass ? null : Math.max(0, config.free.chatMessages - used),
      chatLimit: config.free.chatMessages,
      pricing: publicPricing(),
      devUnlock: devUnlockAllowed(),
      aiMode: resolveProviderKind(),
      copPermitted: config.copSourcePermitted,
      commuteEnabled: commuteEnabled(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
