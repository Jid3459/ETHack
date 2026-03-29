"""
Buffer Integration Test
=======================
Tests the new Buffer GraphQL API using your BUFFER_ACCESS_TOKEN.

Step 1: Lists all connected channels + their IDs.
Step 2: Sends a test post to LinkedIn and Twitter.

Run from repo root:
    python test_buffer.py
"""
from __future__ import annotations

import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("BUFFER_ACCESS_TOKEN", "")
if not TOKEN:
    print("[ERROR] BUFFER_ACCESS_TOKEN is not set in .env")
    sys.exit(1)

GRAPHQL_URL = "https://api.buffer.com/graphql"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

TEST_TEXT = "[TEST] ETHack content pipeline integration check. Safe to delete. "

CREATE_MUTATION = """
mutation CreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess {
      post { id status text }
    }
    ... on InvalidInputError { message }
    ... on UnauthorizedError { message }
    ... on LimitReachedError { message }
    ... on UnexpectedError { message }
    ... on RestProxyError { message }
  }
}
"""

# ── Step 1: List channels ──────────────────────────────────────────────────────

print("\n=== Step 1: Fetching account + connected channels ===\n")

# Get org ID
account_r = requests.post(
    GRAPHQL_URL,
    headers=HEADERS,
    json={"query": "{ account { id email organizations { id name } } }"},
    timeout=10,
)
account_data = account_r.json().get("data", {}).get("account", {})
orgs = account_data.get("organizations", [])
if not orgs:
    print("[ERROR] No organizations found for this token.")
    sys.exit(1)

org_id = orgs[0]["id"]
print(f"Account: {account_data.get('email')}  Org: {orgs[0]['name']} ({org_id})\n")

# Get channels
channels_r = requests.post(
    GRAPHQL_URL,
    headers=HEADERS,
    json={
        "query": """
            query GetChannels($orgId: OrganizationId!) {
              channels(input: { organizationId: $orgId }) {
                id name displayName service type isDisconnected
              }
            }
        """,
        "variables": {"orgId": org_id},
    },
    timeout=10,
)
channels = channels_r.json().get("data", {}).get("channels", [])

print(f"{'Service':<12} {'Channel ID':<30} {'Display Name':<25} {'Disconnected'}")
print("-" * 85)
for ch in channels:
    print(
        f"{ch['service']:<12} {ch['id']:<30} {ch['displayName']:<25} {ch['isDisconnected']}"
    )

print()
print("=== Your .env profile IDs (already auto-filled) ===")
for ch in channels:
    if ch["service"] in ("linkedin", "twitter"):
        key = f"BUFFER_{ch['service'].upper()}_PROFILE_ID"
        print(f"{key}={ch['id']}")

# ── Step 2: Send test posts ────────────────────────────────────────────────────

print("\n=== Step 2: Sending test post to LinkedIn and Twitter ===\n")

target_services = {"linkedin", "twitter"}
for ch in channels:
    if ch["service"] not in target_services:
        continue
    if ch["isDisconnected"]:
        print(f"  SKIP {ch['service']} — channel is disconnected")
        continue

    print(f"-> Posting to {ch['service']} ({ch['displayName']}) [id={ch['id']}] ...")
    resp = requests.post(
        GRAPHQL_URL,
        headers=HEADERS,
        json={
            "query": CREATE_MUTATION,
            "variables": {
                "input": {
                    "channelId": ch["id"],
                    "text": TEST_TEXT,
                    "schedulingType": "automatic",
                    "mode": "shareNow",
                }
            },
        },
        timeout=10,
    )
    result = resp.json()

    if "errors" in result:
        print(f"  [FAIL] GraphQL error: {result['errors'][0].get('message')}")
        continue

    create_post = result.get("data", {}).get("createPost", {})
    if "message" in create_post:
        print(f"  [FAIL] Buffer error: {create_post['message']}")
    elif "post" in create_post:
        post = create_post["post"]
        print(f"  [OK] SUCCESS — post_id={post['id']}  status={post['status']}")
    else:
        print(f"  ? Unexpected response: {create_post}")

print("\n=== Done ===")
print("Check your LinkedIn and Twitter accounts — the test post should be live.\n")
