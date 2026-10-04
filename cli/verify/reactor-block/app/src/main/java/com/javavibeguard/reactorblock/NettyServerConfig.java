package com.javavibeguard.reactorblock;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.web.embedded.netty.NettyReactiveWebServerFactory;
import org.springframework.boot.web.embedded.netty.NettyServerCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.ReactorResourceFactory;

/**
 * Reactive runs (A1-A4, B and the downstream) must serve on Netty. With both starters on the
 * classpath, Boot 3.2.5's ReactiveWebServerFactoryConfiguration imports EmbeddedTomcat before
 * EmbeddedNetty, so a reactive app would run WebFlux on Tomcat (DEVIATIONS.md, 1). This is
 * Boot's own EmbeddedNetty bean, declared here so it wins: same ReactorResourceFactory (the
 * global loops the WebClient also uses) and the same customizers.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.REACTIVE)
public class NettyServerConfig {

    @Bean
    NettyReactiveWebServerFactory nettyReactiveWebServerFactory(ReactorResourceFactory resourceFactory,
                                                                ObjectProvider<NettyServerCustomizer> customizers) {
        NettyReactiveWebServerFactory factory = new NettyReactiveWebServerFactory();
        factory.setResourceFactory(resourceFactory);
        customizers.orderedStream().forEach(factory::addServerCustomizers);
        return factory;
    }
}
