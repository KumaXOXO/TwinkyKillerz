#!/bin/sh
set -e
cd shared && npm install
cd ../client && npm install && npm run build
