![Build Status](https://github.com/cardinalby/schedule-job-action/workflows/build-test/badge.svg)

# Schedule delayed GitHub Actions job 

## Inputs

Specify 1 input from the list to search release by:

* `ghToken` **Required**<br>
Special GitHub access token with `workflows` permission

* `templateYmlFile` **Required**<br>
Path (relative to the repository) to template scheduled workflow yml file.

* `overrideTargetFile` Default: `true`<br>
Override yml file if exists. If `false` and file exists, action will fail.

* `targetYmlFileName` Default: `templateYmlFile`'s name + sha/tag + `.yml`<br>
Target yml file name in `.github/workflows` folder

* `targetBranch` Default: `master`<br>
Branch to push. Please note, scheduled jobs work only in the default branch.

* `pushForce` Default: `true`<br>
Perform `git push` with `--force` flag

* `addTag`<br>
Specify a tag to schedule job for. Will be used as a ref in the checkout step instead of commit sha.

## Outputs
Values from [API](https://docs.github.com/en/rest/reference/repos#releases) response object:

* `targetYmlFileName` File name of the new yml file (inside `.github/workflows` folder)
* `targetYmlFilePath` Absolute path to target yml file

## Example usage()
```yaml
- uses: cardinalby/schedule-job-action@v1
  env:
    GITHUB_TOKEN: ${{ github.token }}
  with:
    templateYmlFile: '.github-scheduled-workflows/example.yml'    
```