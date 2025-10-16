# Daily Diary Infrastructure on AWS

```bash
npm install -g aws-cdk
npm install

AWS_PROFILE={your_profile} AWS_REGION=us-west-2 npx cdk bootstrap
AWS_PROFILE={your_profile} AWS_REGION=us-west-2 npx cdk deploy --require-approval never

#Or use the following command:
npx cdk deploy --profile {your_profile} --region us-west-2 --require-approval never
```
