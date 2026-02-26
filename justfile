set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

default:
  @just --list

alias i := install
alias d := dev
alias b := build
alias t := typecheck
alias u := test
alias pp := perf

install:
  bun install

dev:
  bun run dev

start:
  bun run start

build:
  bun run build

preview:
  bun run preview

typecheck:
  bun run typecheck

test:
  bun run test

test-watch:
  bun run test:watch

perf-serve:
  bun run perf:serve

perf-bench:
  bun run perf:bench

perf:
  bun run test:perf

check:
  bun run typecheck
  bun run test

clean:
  rm -rf dist perf-results node_modules

