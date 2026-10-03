package com.javavibeguard.vibe001.service;

import com.javavibeguard.vibe001.entity.Order;
import com.javavibeguard.vibe001.repository.OrderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.concurrent.CompletableFuture;

@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    private final OrderRepository repository;

    public OrderService(OrderRepository repository) {
        this.repository = repository;
    }

    // VIBE-001: @Transactional + CompletableFuture.join() = connection held during async wait.
    // The DB connection from HikariCP is not released until this method returns,
    // which happens AFTER the 500ms async sleep completes.
    @Transactional
    public Long createOrder() {
        Order saved = repository.save(new Order());
        log.debug("Order {} saved, DB connection still held — starting async wait", saved.getId());

        long start = System.currentTimeMillis();

        // Simulates slow downstream call (notification, pricing, enrichment, etc.)
        CompletableFuture<Void> slowCall = CompletableFuture.supplyAsync(() -> {
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return null;
        });

        slowCall.join(); // blocks: connection held for 500ms while pool is exhausted

        long elapsed = System.currentTimeMillis() - start;
        log.debug("Order {} complete after {}ms (including async wait)", saved.getId(), elapsed);

        return saved.getId();
    }
}
