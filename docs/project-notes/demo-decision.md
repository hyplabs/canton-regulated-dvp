# Demo Decision: Compliance-Gated Settlement

Date: 2026-08-20

## Decision

Build a private regulated-settlement workflow in Daml, followed by a Canton
token-standard DvP integration and a role-based stakeholder UI.

The memorable demo statement is:

> An accepted trade still cannot settle if eligibility was withdrawn or expired.

## Why This Choice

- Multiple institutions have genuinely different authority and visibility.
- The failed paths demonstrate ledger enforcement rather than hidden UI buttons.
- Compliance, custody, settlement deadlines, and audit visibility fit Canton's
  regulated-market positioning.
- The model leads naturally to token-standard allocations instead of inventing
  a generic coin contract.
- The code teaches core Daml concepts through a realistic workflow.

## Honest Scope

V1 is a compliance-gated settlement state machine. `paymentRef` and
`deliveryRef` represent external evidence; they are not token transfers.

V2 is now DvP: both placeholders are replaced by exact Token Standard allocation
legs, and both execute inside `CompleteTokenizedDvP`. The private-credit token is
a focused primary-issuance implementation, so that limitation should remain
clear when presenting the completed local DvP.

## Alternatives Considered

| Option | Decision |
| --- | --- |
| Generic escrow | Rejected as too generic for Canton. |
| Fund subscription/redemption | Viable, but less direct for token-standard DvP. |
| Trade-finance letter of credit | Strong workflow, but too broad for the first week. |
| Attestation registry only | Useful component, but not enough of a complete demo. |
| Quickstart clone | Good reference, but does not demonstrate our own domain model. |

## Success Criteria

- Production templates build without `daml-script`.
- Happy and negative paths execute locally.
- Active eligibility is checked at final settlement.
- Direct creation requires the authorities claimed by the resulting contract.
- Each lifecycle state is single-use and deadline-bound.
- Documentation distinguishes the retained V1 evidence path from V2 token
  movement and its production limitations.
