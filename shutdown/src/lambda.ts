// https://aws.amazon.com/blogs/mobile/understanding-amazon-cognito-user-pool-oauth-2-0-grants/
import {
  ScheduledEvent,
} from 'aws-lambda';
import { AutoScalingClient, UpdateAutoScalingGroupCommand } from "@aws-sdk/client-auto-scaling";
import { RDSClient, StopDBInstanceCommand } from "@aws-sdk/client-rds";

const autoScalingClient = new AutoScalingClient();
const rdsClient = new RDSClient();


export async function handler(event: ScheduledEvent): Promise<void> {
  console.log(JSON.stringify(event, null, 2));

  // Shut down ec2
  const asgCommand = new UpdateAutoScalingGroupCommand({
    AutoScalingGroupName: process.env.AUTO_SCALING_GROUP_NAME,
    MinSize: 0,
    MaxSize: 0,
    DesiredCapacity: 0,
  });
  const data = await autoScalingClient.send(asgCommand);

  // stop rds
  const rdsComand = new StopDBInstanceCommand({
    DBInstanceIdentifier: process.env.RDS_INSTANCE_IDENTIFIER,
  });
  rdsClient.send(rdsComand);

  console.log(JSON.stringify(data));
};
