#!/bin/bash
# Bypass tbkernel license check on Replit (qemu-i386 environment).
# Source binary: TransBase 6.1.2.19 Linux i386 BMW/ESG OEM build.
set -e
cd "$(dirname "$0")/tb"
[ -f tbkernel.orig ] || cp tbkernel tbkernel.orig
cp tbkernel.orig tbkernel
perl -e '
open my $f, "+<:raw", "tbkernel" or die $!;
seek($f, 0x1795d9, 0); print $f pack("H*", "9090");        # NOP js +0x15
seek($f, 0x16c79a, 0); print $f pack("H*", "eb349090909090909090");  # skip expiry-error block
'
echo "tbkernel patched."
