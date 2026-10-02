# testcontainers-doctor: add Docker API compatibility check

## Summary

Testcontainers 1.20.x shades docker-java-core internally and reads the Docker API
version from system property `api.version` (not `DOCKER_API_VERSION` as documented).
Docker Engine 23+ requires a minimum API version of 1.44. Without the fix, all
Testcontainers-based tests fail silently with a 400 Bad Request that is buried
inside the Testcontainers strategy negotiation log.

This is a strong candidate for a new check in `testcontainers-doctor`.

## Steps to Reproduce

1. Install Docker Engine 23+ (API minimum 1.44)
2. Add Testcontainers 1.20.x to a Spring Boot project
3. Run `mvn test` without setting `api.version`
4. Observe: all container-based tests fail with:
   ```
   UnixSocketClientProviderStrategy: failed with exception BadRequestException
   (Status 400: {"message":"client version 1.32 is too old.
   Minimum supported API version is 1.44, please upgrade your client..."})
   ```

## Root Cause

Testcontainers 1.20.x shades `com.github.dockerjava:docker-java-core` under
`org.testcontainers.shaded.com.github.dockerjava.core`. In this shaded version,
`DefaultDockerClientConfig` uses the constant key `"api.version"` (not
`"DOCKER_API_VERSION"`) to read the API version from env/system properties.

The shaded `DEFAULT_API_VERSION` remains `"1.32"` — which Docker Engine 23+
rejects outright (minimum is 1.44).

## Fix Applied in vibe-001 Verifier

In `cli/verify/vibe-001/app/pom.xml`, Surefire is configured with:

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-surefire-plugin</artifactId>
    <configuration>
        <systemPropertyVariables>
            <api.version>1.44</api.version>
        </systemPropertyVariables>
    </configuration>
</plugin>
```

## Proposed testcontainers-doctor Check

**Check name:** `docker-api-version-compatibility`

**What to detect:**
- Docker Engine version ≥ 23 (API minimum 1.44)
- Testcontainers version ≥ 1.20.x on classpath
- System property `api.version` NOT set to ≥ 1.44

**Suggested output:**
```
[WARN] Docker Engine 23+ detected (min API 1.44) but api.version is not set.
       Testcontainers 1.20.x will fail with BadRequestException (Status 400).
       Fix: add -Dapi.version=1.44 to your test JVM args.
```

## Affected Versions

| Docker Engine | Testcontainers | docker-java (shaded) | Behaviour        |
|---------------|----------------|----------------------|------------------|
| < 23          | any            | any                  | Works            |
| ≥ 23          | < 1.20         | 3.3.x (unshaded)     | Works            |
| ≥ 23          | ≥ 1.20         | 3.4.x (shaded)       | **Fails** unless `api.version=1.44` set |
