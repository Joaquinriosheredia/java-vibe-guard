package com.javavibeguard.vibe001.repository;

import com.javavibeguard.vibe001.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, Long> {
}
