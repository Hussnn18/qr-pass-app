# One image for Render: builds the React site, bundles it into the Spring Boot jar, and serves the site
# and the API from the same URL. Build from the repository root:  docker build -t gndec-events .

# 1. Website
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# 2. API, with the website copied in as static files
FROM maven:3.9-eclipse-temurin-21 AS api
WORKDIR /src
COPY backend/pom.xml .
RUN mvn -B -q dependency:go-offline || true
COPY backend/src/ src/
COPY --from=web /web/dist/ src/main/resources/static/
RUN mvn -B -q -DskipTests package && cp target/smart-campus-events-*.jar app.jar

# 3. Runtime
FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 --no-create-home app
WORKDIR /app
COPY --from=api /src/app.jar app.jar
USER app
# Free instances have 512 MB and 0.1 CPU. A 60% heap leaves room for metaspace, threads and buffers;
# the C1-only JIT (TieredStopAtLevel=1) spends far less CPU compiling during start-up.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=60 -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xss512k -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
