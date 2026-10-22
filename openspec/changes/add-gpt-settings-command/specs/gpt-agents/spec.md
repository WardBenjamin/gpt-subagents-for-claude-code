# Spec Delta

## MODIFIED Requirements

### Requirement: The /gpt command
The plugin SHALL register the slash command `/gpt`. `/gpt status` SHALL list this session's GPT runs with type, state, steps and cost. `/gpt cost` SHALL show the ledger's current month and all-time totals by model. `/gpt settings` SHALL list the plugin's settings with the values the session runs on. `/gpt settings <name> <value>` SHALL check the value against the setting's type and save it: through the session's `/config` row where one exists, and otherwise through `claude plugin configure`. Any other argument SHALL show the usage.

#### Scenario: Status after a run
- **WHEN** one `gpt:sol` run finished with 3 steps at $0.02, and the user types `/gpt status`
- **THEN** the output lists that run as `gpt:sol`, done, 3 steps, $0.02

#### Scenario: Setting changed in Desktop
- **WHEN** in a Desktop session the user types `/gpt settings webCacheOnly on` with web access on
- **THEN** the value is saved to the plugin's options, the plugin reloads in that session, and its agent types describe cache-only web access

#### Scenario: Bad value
- **WHEN** the user types `/gpt settings maxUsd lots`
- **THEN** nothing is saved, and the reply says `maxUsd` takes a number above 0
