#!/bin/bash
TBROOT=/home/runner/workspace/data/etk/transbase_linux/transbase_linux
QEMU=/nix/store/0dh3m6ajldz2jk1qd7m1rgrn174izli8-qemu-9.2.4/bin/qemu-i386
GLIBC=/nix/store/kbx5j6lc2i41r9pfzrn86jvrxrqkq25c-glibc-multi-2.40-36
export TRANSBASE="$TBROOT/tb"
export LD_LIBRARY_PATH="$TBROOT/stublibs"
export TRANSBASE_SERVICENAMES="${TBPORTS:-2024:2025}"
exec $QEMU -L "$GLIBC" "$@"
