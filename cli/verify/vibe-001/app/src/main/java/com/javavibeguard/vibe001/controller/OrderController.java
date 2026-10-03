package com.javavibeguard.vibe001.controller;

import com.javavibeguard.vibe001.service.OrderService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/orders")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> createOrder() {
        long start = System.currentTimeMillis();
        Long id = orderService.createOrder();
        long latency = System.currentTimeMillis() - start;
        return ResponseEntity.ok(Map.of("id", id, "latencyMs", latency));
    }
}
