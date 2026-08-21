# KIBA V1 Behaviour Archive

Frozen: 2026-08-20, immediately before the Training V2 rebuild.
Reason: client asked for the exact current version to be preserved for comparison / rollback.

## How to get V1 back

```bash
git checkout kiba-v1-pre-training-v2 -- backend/src/ai   # restore the whole AI layer
git diff kiba-v1-pre-training-v2 -- backend/src/ai        # see everything V2 changed
```

Source commit: 8b254cc (2026-08-18) — backend/src tree was clean, so the tag is byte-exact.
The copy below is the same files, readable without git.

## Contents (sha256)

```
543821a5e595583cef1fde334f7fb786b9007b34adce9acd5d2c52916908c390 *backend-ai-snapshot/ack-guard.ts
9f2e1e7264d841091121a9999a7f5a633ebd85b467e7b1ff361164c9bc03fb1d *backend-ai-snapshot/age-guard.ts
32bf1e65ddfb04c78848b788c1581e99781273a42c8225747674d930b63df018 *backend-ai-snapshot/ai.module.ts
e60b55d15894c2bc4e0da38ddb888454fcdc5451d85c3c9fa83806e5c4ef8e0b *backend-ai-snapshot/anthropic.factory.ts
e02cfcfcd61965d88b547f6f7670a35d26b994f274fbeefc57c4ad41e3964260 *backend-ai-snapshot/board-dump-guard.ts
df036981366ba60a4bc37f332c98fbd172daa7d0ab460494a759887674bdbea6 *backend-ai-snapshot/calc.ts
8d0b95c098529b63ea9d487b5e169e950c9522ee45ead78b8f92c3189f022261 *backend-ai-snapshot/cancellation-guard.ts
c20da2678fe3f588a62538a323f5054a6bf095d52354ebd464ad7c95bd7a2b89 *backend-ai-snapshot/coaching.service.ts
93bde06b252d2b673d3c2a89f0489355f3146c8fc3a39ac4f0299c4cba0e8dcd *backend-ai-snapshot/crisis.service.ts
8b850d659d1823c5e35f4e838dc8bbc85f22f19bffda946d0d9cb43392e210dc *backend-ai-snapshot/goal-classifier.ts
d9e7ff2fa74c611f145e9f68c377fbf72a09d527297bbcb1c719be7269361c80 *backend-ai-snapshot/math-claim-guard.ts
ba7202dcf2b44e4c35015c454a684c26e609000b8e44d82321d275ba36911794 *backend-ai-snapshot/model-params.ts
6c632c5f17b970c42b983879565b3efe37e6b9af36affaf4c5034205dff076c9 *backend-ai-snapshot/plan.service.ts
2bc4c20f89e1c1a9e2ede977bc38e48fe61642a7610b560ccbceaad0fbcd22bc *backend-ai-snapshot/price-guard.ts
c98014a64f07453194a5ef62737ff9ba6716f3a42fe6256e804a49c7f2c39da5 *backend-ai-snapshot/prompts/checkin.prompt.ts
90af9436abf37f9dd6849296648f8a6388d4ced2c0f3e68ec04088e54d0bee84 *backend-ai-snapshot/prompts/coaching.prompt.ts
bd84b1a603a4bfd51fffd5f66ec91cfc29fdf16dda9378dd4a7afd7621a3443b *backend-ai-snapshot/prompts/crisis.prompt.ts
699a70c6223a84ed23c8d06459142aef030cae82fac189e32e607b108efe6d81 *backend-ai-snapshot/prompts/ghost.prompt.ts
037f070b3feee8e2d4f07d6f9e01ccfcecc3f5e533f3692f9ddb9a39e6e611ec *backend-ai-snapshot/prompts/intake.prompt.ts
b80c9ffa2a929cd3e4dd5cf21b7ab1e59af8a556135736c336a2e46cf20f97ee *backend-ai-snapshot/prompts/milestone.prompt.ts
97f2e9d9e2f8936695374677f39b0bb607b1d53c74770999cb31995139f2adc8 *backend-ai-snapshot/prompts/payment-claim.prompt.ts
83a20ba4c5a8b14015ce672f5178159abfe0ef5f1a26cbff0c08eeb9ba70410c *backend-ai-snapshot/prompts/plan.prompt.ts
bbe0bc12690448c1e82a42c0b266dc5268a90e26912872bf7cd7596a6fddfdc5 *backend-ai-snapshot/prompts/recap.prompt.ts
f8e57875f0be82bede6fa2cbd389b1d0bd9fe1a3731dc7b7fd90d9ba2cb1fc56 *backend-ai-snapshot/prompts/summarisation.prompt.ts
0b47b2b1d8dfc44ec364c0e19d5ca0dc1a617da3dde3dfa391af595d6d0b5609 *backend-ai-snapshot/prompts/surprise.prompt.ts
16013d6cb6eb199be9b2b48705e3288ee3c125da0460a5e6f05b56ef172976dc *backend-ai-snapshot/prompts/vision.prompt.ts
48fcddb6953dec4cc02d80c0f2ce8f057540ef762bfb93d7205e562b3e253ef4 *backend-ai-snapshot/prompts/winback.prompt.ts
6ab1ff175f796c672663960b3624cf7bb916cd1b69a8b3a77e9c25c59294f4e5 *backend-ai-snapshot/reminder-claim-guard.ts
cab3f38d6cbcbca2acbc8deccfbb3faf7fa8537528d734cbe8f7f9ffd9e5190b *backend-ai-snapshot/summarisation.service.ts
a110c3178d93eadc959791888afbe2648374e9d73bae92bcebe57c25a92deea4 *backend-ai-snapshot/time-claim-guard.ts
e5bc04a35f71d121845ee868f47fc9e207f598ba778b7d66c8ac21d7a04a8bf9 *backend-ai-snapshot/vision.service.ts
7a6496bd563b10b32befc11692734ba735ce8c0233ff7d6b97e9aab825a84999 *backend-ai-snapshot/weight-claim-guard.ts
e1e437057e18c71db0060c4c51aef6150a412a6ba24bdc9b45d12e96e1a8ce17 *KIBA_Behavior_Rulebook.md
d5c365ae6e16d1829c7c25da23f435b435b698f1796c8d9fc5f2d433b4c96d22 *MANIFEST.md
```
