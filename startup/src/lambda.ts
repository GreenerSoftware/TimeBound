// https://aws.amazon.com/blogs/mobile/understanding-amazon-cognito-user-pool-oauth-2-0-grants/
import {
  ScheduledEvent,
} from 'aws-lambda';
import { AutoScalingClient, UpdateAutoScalingGroupCommand } from "@aws-sdk/client-auto-scaling";
import { RDSClient, StartDBInstanceCommand } from "@aws-sdk/client-rds";
import { slackLog } from './slack';

process.env.COMPONENT = 'shutdown';

const autoScalingClient = new AutoScalingClient();
const rdsClient = new RDSClient();

export async function handler(event: ScheduledEvent): Promise<void> {
  await slackLog(JSON.stringify(event, null, 2));

  // Shut down ec2
  const asgCommand = new UpdateAutoScalingGroupCommand({
    AutoScalingGroupName: process.env.AUTO_SCALING_GROUP_NAME,
    MinSize: 1,
    MaxSize: 1,
    DesiredCapacity: 1,
  });
  const asgResponse = await autoScalingClient.send(asgCommand);
  await slackLog(JSON.stringify(asgResponse, null, 2));

  // start rds
  await slackLog('Starting RDS instance', process.env.RDS_INSTANCE_IDENTIFIER);
  const rdsComand = new StartDBInstanceCommand({
    DBInstanceIdentifier: process.env.RDS_INSTANCE_IDENTIFIER,
  });
  const rdsResponse = rdsClient.send(rdsComand);
  await slackLog(JSON.stringify(rdsResponse, null, 2));
}
