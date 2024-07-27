#!/usr/bin/env bash
set -eu

export AWS_PROFILE=hairtracker
export BUILDS=hairtracker-builds04899a85-jltswq5nxwql
export COMPONENT=slack
export FUNCTION_NAME_EVENTS=hairtracker-slackEvents739156C7-lxQcrxyxF7ma
export FUNCTION_NAME_LOG=hairtracker-slackLog6457AA7A-9xAngtPgJVUe

yarn lint
yarn test
yarn compile
yarn package

# NB to prevent aws output being sent to 'less', see: https://stackoverflow.com/a/60356209/723506
aws s3 cp dist/function.zip s3://${BUILDS}/${COMPONENT}.zip
aws lambda update-function-code --function-name=${FUNCTION_NAME_EVENTS} --s3-bucket ${BUILDS} --s3-key ${COMPONENT}.zip
aws lambda update-function-code --function-name=${FUNCTION_NAME_LOG} --s3-bucket ${BUILDS} --s3-key ${COMPONENT}.zip
