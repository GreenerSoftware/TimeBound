// https://aws.amazon.com/blogs/mobile/understanding-amazon-cognito-user-pool-oauth-2-0-grants/
import {
  ScheduledEvent,
} from 'aws-lambda';
import { AutoScalingClient, UpdateAutoScalingGroupCommand } from "@aws-sdk/client-auto-scaling";

const client = new AutoScalingClient();

export async function handler(event: ScheduledEvent): Promise<void> {
  console.log(JSON.stringify(event, null, 2));

  // Shut down instance
  const command = new UpdateAutoScalingGroupCommand({
    AutoScalingGroupName: process.env.AUTO_SCALING_GROUP_NAME,
    MinSize: 1,
    MaxSize: 1,
    DesiredCapacity: 1,
  });
  // const command = new SetDesiredCapacityCommand({
  //   AutoScalingGroupName: process.env.AUTO_SCALING_GROUP_NAME,
  //   DesiredCapacity: 1,
  // });
  const data = await client.send(command);
  console.log(JSON.stringify(data));
}
