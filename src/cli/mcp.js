// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 JUNG HWANGBO <dostevskii@gmail.com>

import { serve } from '../mcp/server.js';

export default async function mcp() {
  await serve();
  return 0;
}
