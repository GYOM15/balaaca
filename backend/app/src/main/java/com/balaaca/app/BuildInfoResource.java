package com.balaaca.app;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.Map;
import org.eclipse.microprofile.config.inject.ConfigProperty;

/**
 * Confirms which build is running. Deliberately says nothing else: version and
 * name are not sensitive, anything more would be reconnaissance.
 */
@Path("/q/build-info")
public class BuildInfoResource {

    private final String name;
    private final String version;

    public BuildInfoResource(@ConfigProperty(name = "quarkus.application.name") String name,
                             @ConfigProperty(name = "quarkus.application.version") String version) {
        this.name = name;
        this.version = version;
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Map<String, String> get() {
        return Map.of("name", name, "version", version);
    }
}
