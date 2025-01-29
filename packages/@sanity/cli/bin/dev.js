#!/usr/bin/env -S node
import 'ts-blank-space/register'
import {execute} from '@oclif/core'

await execute({development: true, dir: import.meta.url})
