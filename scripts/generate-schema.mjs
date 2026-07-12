#!/usr/bin/env node
// Generates src/generated/schema.ts from @dpdpguard/contract's openapi/v1.yaml.
//
// Why a hand-rolled generator instead of openapi-typescript: openapi-typescript
// 7.x builds its output via the `typescript` compiler API (`ts.factory`), and
// this repo's pinned `typescript@^7.0.2` (the new native/Corsa line) doesn't
// expose that API in the same shape yet — the two are currently incompatible.
// This script only needs a YAML parser and string templating, so it has no
// such dependency.
//
// Scope: emits every schema under components.schemas generically, plus named
// request/response types for the specific operations this SDK implements
// (OPERATIONS below) — those aren't in components.schemas, they're inline in
// the path definitions, per ADR-002 D1 (openapi/v1.yaml is hand-authored and
// is the source of truth for shape). Extending this SDK to a new endpoint
// means adding an entry to OPERATIONS, not hand-writing a type.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const specPath = join(here, "..", "node_modules", "@dpdpguard", "contract", "openapi", "v1.yaml");
const outPath = join(here, "..", "src", "generated", "schema.ts");

const doc = parse(readFileSync(specPath, "utf8"));
const schemas = doc.components?.schemas ?? {};

// Operation-specific inline shapes this SDK's client.ts uses, addressed by
// JSON-pointer-style path into the parsed spec. Kept in sync with the public,
// unauthenticated endpoints implemented in src/client.ts.
const OPERATIONS = [
	{
		typeName: "GetNoticesForOrgResponse",
		pointer: ["paths", "/api/v1/org/{orgId}/notices", "get", "responses", "200", "content", "application/json", "schema"],
	},
	{
		typeName: "GetBannerConfigResponse",
		pointer: ["paths", "/api/v1/org/{orgId}/banner-config", "get", "responses", "200", "content", "application/json", "schema"],
	},
	{
		typeName: "GiveConsentAnonymousRequest",
		pointer: ["paths", "/api/v1/consents/anonymous", "post", "requestBody", "content", "application/json", "schema"],
	},
	{
		typeName: "GiveConsentAnonymousResponse",
		pointer: ["paths", "/api/v1/consents/anonymous", "post", "responses", "201", "content", "application/json", "schema"],
	},
];

function resolvePointer(node, pointer) {
	let cur = node;
	for (const key of pointer) {
		if (cur == null) return undefined;
		cur = cur[key];
	}
	return cur;
}

function refName(ref) {
	const name = ref.replace("#/components/schemas/", "");
	return RENAME[name] ?? name;
}

// `Error` is a global; the spec's `/cm/v1/consent` slice uses that name for
// its free-text-only error shape — rename on the generated side to avoid
// shadowing. Declared before use since `schemaToType`/`refName` close over it.
const RENAME = { Error: "LegacyConsentManagerError" };

/** Converts an OpenAPI 3.1 schema node into a TS type string. `tolerant`
 * widens response enums to `T | (string & {})` so an unrecognized value from
 * a newer server doesn't require a client type change (ADR-002 D4 enabling
 * rule: tolerant readers turn new-enum-value changes into safe minor bumps). */
function schemaToType(schema, { tolerant = true, indent = "" } = {}) {
	if (!schema) return "unknown";
	if (schema.$ref) return refName(schema.$ref);

	const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
	const nullable = types.includes("null");
	const coreTypes = types.filter((t) => t !== "null");

	let core;
	if (schema.enum) {
		const literal = schema.enum.map((v) => JSON.stringify(v)).join(" | ");
		core = tolerant ? `${literal} | (string & {})` : literal;
	} else if (coreTypes.includes("string")) {
		core = "string";
	} else if (coreTypes.includes("integer") || coreTypes.includes("number")) {
		core = "number";
	} else if (coreTypes.includes("boolean")) {
		core = "boolean";
	} else if (coreTypes.includes("array")) {
		const itemType = schemaToType(schema.items, { tolerant, indent });
		core = `Array<${itemType}>`;
	} else if (coreTypes.includes("object") || schema.properties) {
		core = objectSchemaToInterfaceBody(schema, indent + "\t");
	} else {
		core = "unknown";
	}

	return nullable ? `${core} | null` : core;
}

const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function objectSchemaToInterfaceBody(schema, indent) {
	const required = new Set(schema.required ?? []);
	const props = schema.properties ?? {};
	const lines = Object.entries(props).map(([name, propSchema]) => {
		const optional = required.has(name) ? "" : "?";
		const type = schemaToType(propSchema, { indent });
		const description = propSchema.description ? `${indent}/** ${propSchema.description.trim()} */\n` : "";
		const key = VALID_IDENTIFIER.test(name) ? name : JSON.stringify(name);
		return `${description}${indent}${key}${optional}: ${type};`;
	});
	if (lines.length === 0) return "Record<string, unknown>";
	return `{\n${lines.join("\n")}\n${indent.slice(1)}}`;
}

const parts = [
	"// AUTO-GENERATED by scripts/generate-schema.mjs from @dpdpguard/contract's",
	"// openapi/v1.yaml. Do not hand-edit — run `npm run generate` instead.",
	"",
];

for (const [name, schema] of Object.entries(schemas)) {
	const emittedName = RENAME[name] ?? name;
	parts.push(`export interface ${emittedName} ${schemaToType(schema, { tolerant: true })}`);
	parts.push("");
}

for (const { typeName, pointer } of OPERATIONS) {
	const schema = resolvePointer(doc, pointer);
	if (!schema) {
		throw new Error(`generate-schema: spec pointer not found for ${typeName}: ${pointer.join(" > ")}`);
	}
	parts.push(`export interface ${typeName} ${schemaToType(schema, { tolerant: true })}`);
	parts.push("");
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, parts.join("\n"), "utf8");
console.log(`generate-schema: wrote ${Object.keys(schemas).length + OPERATIONS.length} types to ${outPath}`);
