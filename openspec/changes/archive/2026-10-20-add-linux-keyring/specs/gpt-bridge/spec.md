# Spec Delta

## MODIFIED Requirements

### Requirement: Read the key from the Keychain
On macOS, the bridge SHALL read its OpenAI API key from the Keychain generic-password item `openai`. On every platform, `OPENAI_API_KEY` in the bridge's own environment SHALL override any key store. The key SHALL never appear in any tool result, log line or error.

#### Scenario: Key in the Keychain
- **WHEN** the bridge runs on macOS, `OPENAI_API_KEY` is unset, and the Keychain holds the item `openai`
- **THEN** the bridge uses that item's secret as the key

#### Scenario: Environment override
- **WHEN** `OPENAI_API_KEY` is set in the bridge's environment
- **THEN** the bridge uses that value and does not query any key store

#### Scenario: No key available
- **WHEN** the bridge runs on macOS and neither the Keychain item nor `OPENAI_API_KEY` exists
- **THEN** every tool returns an error saying no OpenAI key was found, naming the Keychain item `openai`, and no request is sent

## ADDED Requirements

### Requirement: Read the key from the Secret Service on Linux
On Linux, when `OPENAI_API_KEY` is not set in the bridge's environment, the bridge SHALL read its OpenAI API key from the freedesktop Secret Service item with the attribute `service` = `openai`, as `secret-tool lookup service openai` returns it.

#### Scenario: Key stored in the keyring
- **WHEN** the bridge runs on Linux, `OPENAI_API_KEY` is unset, and the Secret Service holds an item with `service` = `openai`
- **THEN** the bridge uses that item's secret as the key

#### Scenario: Environment override on Linux
- **WHEN** the bridge runs on Linux with `OPENAI_API_KEY` set
- **THEN** the bridge uses that value and does not query the Secret Service

### Requirement: Fall back to a key file on Linux
On Linux, when the Secret Service gives no key (no D-Bus session, a locked keyring, no matching item, `secret-tool` missing, or no answer within 15 s), the bridge SHALL read the key from `$XDG_CONFIG_HOME/gpt/openai-key`, or `~/.config/gpt/openai-key` when `XDG_CONFIG_HOME` is unset, ignoring surrounding whitespace. The bridge SHALL refuse the file if its group or other users have any access to it.

#### Scenario: Headless host with a key file
- **WHEN** the bridge runs on Linux with no D-Bus session, and `~/.config/gpt/openai-key` has mode `0600` and holds a key followed by a newline
- **THEN** the bridge uses the key without the newline

#### Scenario: Keyring hit wins over the file
- **WHEN** both the Secret Service item and the key file hold a key
- **THEN** the bridge uses the Secret Service key and does not read the file

#### Scenario: Key file readable by others
- **WHEN** the key file has mode `0644`
- **THEN** every tool returns an error naming the file and `chmod 600`, the error does not contain the key, and no request is sent to OpenAI

### Requirement: Name the platform's key store when no key is found
When no key is found, the bridge's error SHALL name the key store and the command that fills it for the platform it runs on, and SHALL mention `OPENAI_API_KEY`. The error SHALL never contain a key.

#### Scenario: No key on macOS
- **WHEN** the bridge runs on macOS, `OPENAI_API_KEY` is unset, and the Keychain has no item `openai`
- **THEN** every tool returns an error naming the Keychain item `openai` and `security add-generic-password -s openai -a "$USER" -w`

#### Scenario: No key on Linux
- **WHEN** the bridge runs on Linux, `OPENAI_API_KEY` is unset, the Secret Service gives no key and the key file does not exist
- **THEN** every tool returns an error naming `secret-tool store --label='OpenAI API key' service openai` (from `libsecret-tools`) and the key file's full path, and no request is sent to OpenAI
