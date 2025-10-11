#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { DailyDiaryStack } from "../lib/daily-diary-stack";

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;
const app = new cdk.App();
new DailyDiaryStack(app, "DailyDiaryStack", {
  env: {
    account: account,
    region: region,
  },
});
