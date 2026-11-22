// The entry of api.html: one app, rendering the API page into its <tk-api-docs> element.

import { bootstrap } from "@tinker/core";
import { valueOrThrow } from "@tinker/functional";
import { ApiDocs } from "./api-docs.ts";

valueOrThrow(bootstrap(ApiDocs));
