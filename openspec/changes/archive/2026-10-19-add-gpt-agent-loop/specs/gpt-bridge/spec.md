# Spec Delta

## ADDED Requirements

### Requirement: Cancel turns whose caller is gone
The bridge SHALL cancel an in-progress OpenAI response when the MCP request polling it (`turn` or `wait`) is cancelled. It SHALL also cancel a response that no `turn` or `wait` call has polled for 60 seconds.

#### Scenario: Caller's request cancelled
- **WHEN** a `wait` request is cancelled by the MCP client while its response is in progress
- **THEN** the bridge stops polling and cancels that response at OpenAI

#### Scenario: Caller stopped polling
- **WHEN** `turn` returned `in_progress` and no `wait` for that id arrives within 60 seconds
- **THEN** the bridge cancels that response at OpenAI
