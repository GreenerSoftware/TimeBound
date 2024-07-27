# TimeBound

fixed time bound, e.g. 0700-2300

## Infrastructure build inputs

Create the following files under `.infrastructure/secrets/`

 ### `aws.sh`

export AWS_PROFILE=alwayson

### `github.sh`

export PERSONAL_ACCESS_TOKEN=ghp_xxxx (Personal Accees Token with `repo` scope)
export OWNER=GreenerSoftware
export REPO=timebound
