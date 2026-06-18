#!/usr/bin/env zsh
set -e

if grep -rEn 'from .*engines/hyperbolic-lr' apps/tree-editor/src/lib/layout/engines/family-view/ 2>/dev/null; then
  print -u2 'relationship-vocabulary main wave forbids importing from engines/hyperbolic-lr (Wave 2 deferral)'
  exit 1
fi
