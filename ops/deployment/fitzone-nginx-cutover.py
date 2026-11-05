#!/usr/bin/env python3
"""Pure FitZone Nginx cutover rendering. Never writes live configuration."""

import re

BLUE = 3120
GREEN = 3121

SELECTORS = {
    "~ ^/api/auth/(login|register|forgot-password)",
    "/api/",
    "/",
}

PROXY_PATTERN = re.compile(
    r"(?m)^([ \t]*proxy_pass[ \t]+)"
    r"http://127\.0\.0\.1:(3120|3121)([ \t]*;)"
)

ALL_PROXY_PATTERN = re.compile(r"(?m)^\s*proxy_pass\b")

LOCATION_PATTERN = re.compile(
    r"(?m)^[ \t]*location[ \t]+(.+?)[ \t]*\{"
)


def render_cutover(config, source_port, target_port):
    """Return modified text or fail closed. No filesystem access."""
    if (source_port, target_port) not in (
        (BLUE, GREEN),
        (GREEN, BLUE),
    ):
        raise ValueError("INVALID_CUTOVER_DIRECTION")

    if not isinstance(config, str):
        raise ValueError("INVALID_CONFIG_INPUT")

    if "\x00" in config:
        raise ValueError("INVALID_CONFIG_CONTENT")

    if not re.search(
        r"(?m)^\s*server_name\s+[^;]*"
        r"\bfitzoneland\.com\b[^;]*;",
        config,
    ):
        raise ValueError("FITZONE_SERVER_NAME_MISSING")

    locations = list(LOCATION_PATTERN.finditer(config))

    # Locate server blocks and ensure that all three routes belong
    # to one and only one FitZone virtual host.
    server_pattern = re.compile(
        r"(?m)^[ \t]*server[ \t]*\{"
    )
    scopes = []

    for server_match in server_pattern.finditer(config):
        opening = config.find("{", server_match.start(), server_match.end())
        depth = 0
        closing = None

        for index in range(opening, len(config)):
            if config[index] == "{":
                depth += 1
            elif config[index] == "}":
                depth -= 1
                if depth == 0:
                    closing = index + 1
                    break

        if closing is None:
            raise ValueError("UNTERMINATED_SERVER_BLOCK")

        scopes.append((server_match.start(), closing))

    owners = set()

    for location in locations:
        if location.group(1).strip() not in SELECTORS:
            continue

        matching = [
            index
            for index, (start, end) in enumerate(scopes)
            if start <= location.start() < end
        ]

        if len(matching) != 1:
            raise ValueError("ROUTING_SERVER_SCOPE_MISMATCH")

        owners.add(matching[0])

    if len(owners) != 1:
        raise ValueError("ROUTING_SERVER_SCOPE_MISMATCH")

    owner = scopes[next(iter(owners))]
    server_text = config[owner[0]:owner[1]]

    if not re.search(
        r"(?m)^[ \t]*server_name[ \t]+fitzoneland\.com[ \t]*;",
        server_text,
    ):
        raise ValueError("ROUTING_NOT_IN_FITZONE_SERVER")

    found = {}

    for match in locations:
        selector = match.group(1).strip()

        if selector not in SELECTORS:
            continue

        if selector in found:
            raise ValueError("DUPLICATE_ROUTING_LOCATION")

        opening = config.find("{", match.start(), match.end())
        closing = config.find("}", opening + 1)

        if closing == -1:
            raise ValueError("UNTERMINATED_ROUTING_LOCATION")

        body = config[opening + 1:closing]

        if "{" in body:
            raise ValueError("NESTED_LOCATION_UNSUPPORTED")

        proxies = list(PROXY_PATTERN.finditer(body))

        if len(proxies) != 1:
            raise ValueError("ROUTING_LOCATION_PROXY_MISMATCH")

        if len(ALL_PROXY_PATTERN.findall(body)) != 1:
            raise ValueError("UNEXPECTED_PROXY_DIRECTIVE")

        if int(proxies[0].group(2)) != source_port:
            raise ValueError("SOURCE_PORT_MISMATCH")

        found[selector] = True

    if set(found) != SELECTORS:
        raise ValueError("FITZONE_ROUTING_LOCATIONS_MISMATCH")

    if len(ALL_PROXY_PATTERN.findall(config)) != 3:
        raise ValueError("UNEXPECTED_GLOBAL_PROXY_DIRECTIVES")

    proxies = list(PROXY_PATTERN.finditer(config))

    if len(proxies) != 3:
        raise ValueError("PROXY_INVENTORY_MISMATCH")

    if any(int(item.group(2)) != source_port for item in proxies):
        raise ValueError("MIXED_OR_UNEXPECTED_PORTS")

    updated, count = PROXY_PATTERN.subn(
        lambda match: (
            match.group(1)
            + "http://127.0.0.1:"
            + str(target_port)
            + match.group(3)
        ),
        config,
    )

    if count != 3 or updated == config:
        raise ValueError("CUTOVER_RENDER_FAILED")

    return updated
