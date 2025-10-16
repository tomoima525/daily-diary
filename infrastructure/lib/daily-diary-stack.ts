import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Effect } from "aws-cdk-lib/aws-iam";

export class DailyDiaryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket for photos and videos
    const bucket = new s3.Bucket(this, "DailyDiaryBucket", {
      bucketName: "daily-diary-storage-bucket",
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
        },
      ],
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      publicReadAccess: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For hackathon - use RETAIN in production
    });

    // Add bucket policy to allow public read access to photos
    bucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowPublicReadAccess",
        effect: iam.Effect.ALLOW,
        principals: [new iam.AnyPrincipal()],
        actions: ["s3:GetObject"],
        resources: [`${bucket.bucketArn}/*`],
      })
    );

    // CloudFront distribution for faster access
    const distribution = new cloudfront.Distribution(
      this,
      "DailyDiaryDistribution",
      {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      }
    );

    // IAM role for server to access S3
    const serverRole = new iam.Role(this, "DailyDiaryServerRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      inlinePolicies: {
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket",
              ],
              resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
            }),
          ],
        }),
      },
    });

    const secretManagerPolicy = new iam.PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["secretsmanager:GetSecretValue"],
      resources: [
        `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
      ],
    });

    // FFmpeg Layer from S3 asset
    const ffmpegLayer = new lambda.LayerVersion(this, "ffmpeg-layer", {
      layerVersionName: "ffmpeg-layer",
      code: lambda.Code.fromBucket(
        s3.Bucket.fromBucketName(
          this,
          "daily-diary-bucket",
          "daily-diary-storage-bucket"
        ),
        "layers/ffmpeg-layer.zip"
        // TODO we should set the object version to the latest version of the layer. We need the version for S3 bucket
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      description: "FFmpeg binary for audio/video processing",
    });

    // Video Generation Lambda Function
    const videoGeneratorFunction = new NodejsFunction(
      this,
      "VideoGeneratorFunction",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        entry: "lambda/video-generator/src/index.ts",
        timeout: cdk.Duration.minutes(15),
        memorySize: 10240,
        layers: [ffmpegLayer],
        environment: {
          S3_BUCKET_NAME: bucket.bucketName,
          DAILY_DIARY_SECRET_ID: "daily-diary-secrets",
        },
        bundling: {
          externalModules: ["@aws-sdk/*"],
          minify: false,
          sourceMap: true,
        },
      }
    );

    videoGeneratorFunction.addToRolePolicy(secretManagerPolicy);

    // Grant S3 permissions to the video generator function
    bucket.grantReadWrite(videoGeneratorFunction);

    // Output values for use in application
    new cdk.CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
      description: "S3 bucket name for Daily Diary",
    });

    new cdk.CfnOutput(this, "CloudFrontDomain", {
      value: distribution.distributionDomainName,
      description: "CloudFront distribution domain",
    });

    new cdk.CfnOutput(this, "BucketRegion", {
      value: this.region,
      description: "S3 bucket region",
    });

    new cdk.CfnOutput(this, "VideoGeneratorFunctionArn", {
      value: videoGeneratorFunction.functionArn,
      description: "Video generator Lambda function ARN",
    });
  }
}
