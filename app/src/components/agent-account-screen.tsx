import { useCallback, useEffect, useState } from "react";
import { Bot, Copy, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import type { Address } from "viem";
import { ActionGlyphButton } from "@/components/action-glyph-button";
import { AppPageShell } from "@/components/app-page-shell";
import { pushActionError } from "@/lib/action-error";
import { useActionGlyph } from "@/lib/use-action-glyph";
import {
  agentConfigMarkdown,
  agentRoleLabel,
  createLocalAgentConfig,
  loadLocalAgentConfig,
  readOnChainAgent,
  removeLocalAgentConfig,
  saveLocalAgentConfig,
  type AgentRole,
  type LocalAgentConfig,
} from "@/lib/agent-account";
import {
  passkeyRemoveAgent,
  passkeySetAgent,
} from "@/lib/auth/passkey-client";
import { loadPasskeyRecord } from "@/lib/auth/passkey-record";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function AgentAccountScreen() {
  const [local, setLocal] = useState<LocalAgentConfig | null>(null);
  const [onChain, setOnChain] = useState<{ agent: Address; role: number } | null>(null);
  const [role, setRole] = useState<AgentRole>(1);
  const createAction = useActionGlyph();
  const removeAction = useActionGlyph();
  const copyAction = useActionGlyph();

  const owner = loadPasskeyRecord()?.address ?? null;

  const refresh = useCallback(async () => {
    if (!owner) return;
    setLocal(loadLocalAgentConfig(owner));
    const authorization = await readOnChainAgent(owner);
    setOnChain(authorization);
    if (authorization?.role === 1 || authorization?.role === 2) setRole(authorization.role);
  }, [owner]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const localMatchesChain = Boolean(
    local && onChain && local.agentAccount.toLowerCase() === onChain.agent.toLowerCase(),
  );

  async function createOrReset() {
    if (!owner) {
      pushActionError("Sign in with a passkey first.");
      return;
    }
    await createAction.run(async () => {
      const config = await createLocalAgentConfig(role);
      await passkeySetAgent(config.agentAccount, role);
      saveLocalAgentConfig(owner, config);
      setLocal(config);
      setOnChain({ agent: config.agentAccount, role });
    });
  }

  async function remove() {
    if (!owner) return;
    await removeAction.run(async () => {
      await passkeyRemoveAgent();
      removeLocalAgentConfig(owner);
      setLocal(null);
      setOnChain(null);
    });
  }

  async function copyConfig() {
    if (!localMatchesChain || !local) return;
    await copyAction.run(async () => {
      await navigator.clipboard.writeText(await agentConfigMarkdown(local));
    });
  }

  return (
    <AppPageShell title="Agent account" backTo="/me/manager">
      <div className="mx-auto max-w-md">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <Bot className="size-5" />
            </span>
            <p className="text-sm text-muted">Let your agent manage all your idols</p>
          </div>

          {!owner ? (
            <p className="mt-5 rounded-xl bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
              Sign in with a passkey before creating an agent.
            </p>
          ) : null}

          <div className="mt-5 rounded-xl border border-border bg-surface-1 p-3">
            <p className="text-sm font-medium">Permission level</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([1, 2] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={createAction.status === "pending" || removeAction.status === "pending"}
                  onClick={() => setRole(value)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    role === value
                      ? "border-accent bg-accent/10 text-fg"
                      : "border-border text-muted hover:bg-surface-2"
                  }`}
                >
                  <span className="block font-medium text-fg">
                    {value === 1 ? "Content only" : "Full access"}
                  </span>
                  <span>{value === 1 ? "Profile, content, and visibility" : "Content and pricing management"}</span>
                </button>
              ))}
            </div>
          </div>

          {onChain ? (
            <div className="mt-3 rounded-xl border border-border bg-surface-1 p-3 text-sm">
              <div className="flex items-center gap-2 text-fg">
                <ShieldCheck className="size-4 text-emerald-400" />
                <span>Authorized on-chain: {agentRoleLabel(onChain.role === 2 ? 2 : 1)}</span>
              </div>
              <p className="mt-1 font-mono text-xs text-muted">{shortAddress(onChain.agent)}</p>
              {localMatchesChain ? (
                <p className="mt-2 text-xs text-muted">This browser has the agent configuration.</p>
              ) : (
                <p className="mt-2 text-xs text-amber-300">
                  This browser doesn't have that account's key. Reset to replace it with a new agent.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-surface-1 px-3 py-2.5 text-xs text-muted">
              No agent is authorized. A new authorization applies to every idol you own now or later.
            </p>
          )}

          {localMatchesChain ? (
            <ActionGlyphButton
              status={copyAction.status}
              idleLabel="Copy Codex MCP configuration"
              pendingLabel="Copying…"
              successLabel="Copied"
              onClick={() => void copyConfig()}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-accent text-sm font-medium text-fg"
            >
              <Copy className="size-4" />
              Copy Codex MCP configuration
            </ActionGlyphButton>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <ActionGlyphButton
              status={createAction.status}
              disabled={!owner}
              idleLabel={onChain ? "Reset agent" : "Create agent"}
              pendingLabel="Confirming…"
              onClick={() => void createOrReset()}
              className="flex h-10 items-center justify-center gap-1.5 rounded-full border border-accent/60 text-sm text-accent disabled:opacity-45"
            >
              <RefreshCw className="size-4" />
              {onChain ? "Reset agent" : "Create agent"}
            </ActionGlyphButton>
            <ActionGlyphButton
              status={removeAction.status}
              disabled={!onChain}
              idleLabel="Remove access"
              pendingLabel="Revoking…"
              onClick={() => void remove()}
              className="flex h-10 items-center justify-center gap-1.5 rounded-full border border-red-400/45 text-sm text-red-300 disabled:opacity-45"
            >
              <Trash2 className="size-4" />
              Remove access
            </ActionGlyphButton>
          </div>

          <p className="mt-4 text-xs leading-5 text-muted">
            The key stays in this browser. Copied Markdown tells Codex/Cursor to connect to aim100x.fun/mcp with a signed bearer token — aim100x.fun verifies it on-chain and stores nothing. Clearing site data makes the key unrecoverable; reset the agent to replace it. Full access includes pricing, so share it only with an agent you trust.
          </p>
        </div>
    </AppPageShell>
  );
}
